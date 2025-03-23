FROM ubuntu:latest  

# Cài đặt OpenSSH Server  
RUN apt update && apt install -y openssh-server && \
    mkdir /var/run/sshd && \
    echo 'root:password' | chpasswd  

# Cấu hình SSH để cho phép root login  
RUN sed -i 's/^#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config  

# Mở port SSH  
EXPOSE 22  

CMD ["/usr/sbin/sshd", "-D"]
